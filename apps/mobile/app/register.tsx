import { Link } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Field, colors } from '@/components/ui';

export default function Register() {
  const { login } = useAuth();
  const [f, setF] = useState({ username: '', fullName: '', email: '', phone: '', password: '', referralCode: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  async function submit() {
    setBusy(true); setErr('');
    try {
      const body: Record<string, string> = { ...f }; if (!body.phone) delete body.phone;
      await request('/auth/register', { method: 'POST', auth: false, body });
      await login(f.username.trim(), f.password);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 28, fontWeight: '700', color: colors.text }}>Create account</Text>
        {err ? <Banner text={err} tone="danger" /> : null}
        <Field placeholder="Referral code (from your staff contact)" value={f.referralCode} onChangeText={(v) => set('referralCode')(v.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} maxLength={16} autoCapitalize="characters" />
        <Field placeholder="Username (3–32 letters, digits, . _ -)" value={f.username} onChangeText={set('username')} />
        <Field placeholder="Full name" value={f.fullName} onChangeText={set('fullName')} autoCapitalize="words" />
        <Field placeholder="Email" value={f.email} onChangeText={set('email')} keyboardType="email-address" />
        <Field placeholder="Phone (optional)" value={f.phone} onChangeText={set('phone')} keyboardType="phone-pad" />
        <Field placeholder="Password (min 10 characters)" value={f.password} onChangeText={set('password')} secureTextEntry />
        <Button title="Register" onPress={submit} busy={busy} />
        <View style={{ alignItems: 'center' }}><Link href="/login" style={{ color: colors.primary }}>Back to sign in</Link></View>
      </ScrollView>
    </SafeAreaView>
  );
}
