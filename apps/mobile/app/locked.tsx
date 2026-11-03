import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { Button, colors } from '@/components/ui';

export default function Locked() {
  const { unlock, logout } = useAuth();
  const [failed, setFailed] = useState(false);
  const attempt = async () => setFailed(!(await unlock()));
  useEffect(() => { attempt(); /* prompt on open */ }, []); // eslint-disable-line
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: colors.text }}>Locked</Text>
      {failed && <Text style={{ color: colors.muted }}>Authentication was not completed.</Text>}
      <Button title="Unlock" onPress={attempt} />
      <Button title="Sign out" kind="ghost" onPress={logout} />
    </View>
  );
}
