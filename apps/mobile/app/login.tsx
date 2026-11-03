import { Link } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Field, colors } from '@/components/ui';

export default function Login() {
  const { login } = useAuth();
  const [username, setU] = useState(''); const [password, setP] = useState(''); const [totp, setT] = useState('');
  const [needTotp, setNeedTotp] = useState(false); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; maintenance?: boolean } | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try { await login(username.trim(), password, needTotp ? totp : undefined); }
    catch (e) {
      const a = e as ApiError;
      if (/two-factor/i.test(a.message)) setNeedTotp(true);
      setErr({ text: a.message, maintenance: a.code?.startsWith('APP_') });
    } finally { setBusy(false); }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24, gap: 12, flexGrow: 1, justifyContent: 'center' }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>Sign in</Text>
          {err && <Banner text={err.text} tone={err.maintenance ? 'warn' : 'danger'} />}
          <Field placeholder="Username" value={username} onChangeText={setU} textContentType="username" />
          <Field placeholder="Password" value={password} onChangeText={setP} secureTextEntry textContentType="password" />
          {needTotp && <Field placeholder="6-digit 2FA code" value={totp} onChangeText={setT} keyboardType="number-pad" maxLength={6} />}
          <Button title="Sign in" onPress={submit} busy={busy} />
          <View style={{ alignItems: 'center', marginTop: 8 }}><Link href="/register" style={{ color: colors.primary }}>Create an account</Link></View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
