import React, { useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, Card, Row, colors } from '@/components/ui';

export default function Profile() {
  const { profile, logout, biometricAvailable, biometricEnabled, setBiometric } = useAuth();
  const [busy, setBusy] = useState(false);
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
      <Button title="Sign out" kind="danger" onPress={confirmLogout} busy={busy} />
    </ScrollView>
  );
}
