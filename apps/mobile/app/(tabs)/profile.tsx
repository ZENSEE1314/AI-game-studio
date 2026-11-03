import React, { useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Card, Field, Row, colors } from '@/components/ui';

export default function Profile() {
  const { profile, logout, biometricAvailable, biometricEnabled, setBiometric } = useAuth();
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState({ cur: '', next: '', again: '' }); const [pwBusy, setPwBusy] = useState(false); const [pwMsg, setPwMsg] = useState<{ t: string; bad?: boolean } | null>(null);
  async function changePw() {
    if (pw.next !== pw.again) return setPwMsg({ t: 'New passwords do not match', bad: true });
    setPwBusy(true); setPwMsg(null);
    try { await request('/auth/change-password', { method: 'POST', body: { currentPassword: pw.cur, newPassword: pw.next } }); setPw({ cur: '', next: '', again: '' }); setPwMsg({ t: 'Password changed. Other devices were signed out.' }); }
    catch (e: any) { setPwMsg({ t: e.message, bad: true }); } finally { setPwBusy(false); }
  }
  const confirmLogout = () => Alert.alert('Sign out', 'Sign out of this device?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { setBusy(true); await logout(); } },
  ]);
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Row k="Name" v={profile?.fullName ?? '—'} /><Row k="Username" v={profile?.username ?? '—'} />
        <Row k="Email" v={profile?.email ?? '—'} /><Row k="Phone" v={profile?.phone ?? '—'} />
        <Row k="Member since" v={profile ? new Date(profile.createdAt).toLocaleDateString() : '—'} />
        <Row k="Last login" v={profile?.lastLogin ? new Date(profile.lastLogin).toLocaleString() : '—'} />
      </Card>
      {biometricAvailable && (
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: colors.text }}>Biometric unlock</Text>
            <Switch value={biometricEnabled} onValueChange={setBiometric} />
          </View>
        </Card>
      )}
      <Card>
        <Text style={{ fontWeight: '600', color: colors.text }}>Change password</Text>
        {pwMsg && <Banner text={pwMsg.t} tone={pwMsg.bad ? 'danger' : 'warn'} />}
        <Field placeholder="Current password" value={pw.cur} onChangeText={(v) => setPw({ ...pw, cur: v })} secureTextEntry />
        <Field placeholder="New password (min 10 characters)" value={pw.next} onChangeText={(v) => setPw({ ...pw, next: v })} secureTextEntry />
        <Field placeholder="Repeat new password" value={pw.again} onChangeText={(v) => setPw({ ...pw, again: v })} secureTextEntry />
        <Button title="Change password" onPress={changePw} busy={pwBusy} />
      </Card>
      <Button title="Sign out" kind="danger" onPress={confirmLogout} busy={busy} />
    </ScrollView>
  );
}
