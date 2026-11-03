import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';
import { request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Banner, Button, Card, Field, colors } from '@/components/ui';

const CHILD: Record<string, string> = { AGENCY: 'AGENT', AGENT: 'STAFF', STAFF: 'USER' };
type Acc = { id: string; username: string; fullName: string; role: string; status: string };

export default function Team() {
  const { profile } = useAuth();
  const childRole = profile ? CHILD[profile.role] : undefined;
  const [items, setItems] = useState<Acc[]>([]); const [total, setTotal] = useState(0);
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false); const [err, setErr] = useState('');
  const [adding, setAdding] = useState(false); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ username: '', fullName: '', email: '', password: '' });

  const load = useCallback(async (p = 1, replace = true) => {
    setErr('');
    try {
      const r = await request<{ items: Acc[]; total: number }>(`/accounts?limit=25&page=${p}${q ? `&search=${encodeURIComponent(q)}` : ''}`);
      setItems((cur) => (replace ? r.items : [...cur, ...r.items])); setTotal(r.total); setPage(p);
    } catch (e: any) { setErr(e.message); }
  }, [q]);
  useEffect(() => { load(1); }, [load]);

  async function create() {
    setBusy(true); setErr('');
    try { await request('/accounts', { method: 'POST', body: { ...f, role: childRole } }); setAdding(false); setF({ username: '', fullName: '', email: '', password: '' }); await load(1); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 10 }}
      data={items} keyExtractor={(a) => a.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(1); setRefreshing(false); }} />}
      onEndReached={() => items.length < total && load(page + 1, false)}
      ListHeaderComponent={
        <View style={{ gap: 10 }}>
          <Field placeholder="Search your downline" value={q} onChangeText={setQ} />
          {err ? <Banner text={err} tone="danger" /> : null}
          {childRole && !adding && <Button title={`Add ${childRole.toLowerCase()}`} onPress={() => setAdding(true)} />}
          {adding && (
            <Card>
              <Field placeholder="Username" value={f.username} onChangeText={(v) => setF({ ...f, username: v })} />
              <Field placeholder="Full name" value={f.fullName} onChangeText={(v) => setF({ ...f, fullName: v })} autoCapitalize="words" />
              <Field placeholder="Email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" />
              <Field placeholder="Password (min 10 characters)" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secureTextEntry />
              <Button title="Create" onPress={create} busy={busy} />
              <Button title="Cancel" kind="ghost" onPress={() => setAdding(false)} />
            </Card>)}
          <Text style={{ color: colors.muted }}>{total} account(s)</Text>
        </View>}
      renderItem={({ item }) => (
        <Card>
          <Text style={{ fontWeight: '600', color: colors.text }}>{item.fullName}</Text>
          <Text style={{ color: colors.muted }}>@{item.username} · {item.role.toLowerCase()} · {item.status.toLowerCase()}</Text>
        </Card>)}
    />
  );
}
