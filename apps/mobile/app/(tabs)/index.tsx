import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text } from 'react-native';
import { request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Card, Row, colors } from '@/components/ui';

export default function Home() {
  const { profile, reload } = useAuth();
  const [sys, setSys] = useState<{ status: string; message: string | null } | null>(null);
  const [refreshing, setRefreshing] = useState(false); const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setErr('');
    try { setSys(await request('/system/status', { auth: false })); await reload(); }
    catch (e: any) { setErr(e.message); }
  }, [reload]);
  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: colors.text }}>Hello, {profile?.fullName ?? '…'}</Text>
      {err ? <Banner text={err} tone="danger" /> : null}
      {sys && sys.status !== 'ACTIVE' && <Banner text={sys.message ?? `The application is in ${sys.status.toLowerCase()} mode.`} />}
      <Card>
        <Row k="Account" v={profile?.username ?? '—'} />
        <Row k="Level" v={profile?.role?.replace('_', ' ') ?? '—'} />
        <Row k="Status" v={profile?.status ?? '—'} />
        <Row k="Application" v={sys?.status ?? '—'} />
      </Card>
      <Text style={{ color: colors.muted }}>More features arrive in later releases.</Text>
    </ScrollView>
  );
}
