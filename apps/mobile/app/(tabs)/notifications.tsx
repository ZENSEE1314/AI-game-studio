import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { request } from '@/lib/api';
import { Banner, Button, colors } from '@/components/ui';

type N = { id: string; title: string; body: string; readAt: string | null; createdAt: string; data?: { roundId?: string } | null };

export default function Notifications() {
  const router = useRouter();
  const [items, setItems] = useState<N[]>([]); const [total, setTotal] = useState(0); const [unread, setUnread] = useState(0); const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false); const [err, setErr] = useState('');

  const load = useCallback(async (p = 1, replace = true) => {
    setErr('');
    try {
      const r = await request<{ items: N[]; total: number; unread: number }>(`/notifications?limit=20&page=${p}`);
      setItems((cur) => (replace ? r.items : [...cur, ...r.items])); setTotal(r.total); setUnread(r.unread); setPage(p);
    } catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(1); }, [load]);

  async function open(n: N) {
    if (!n.readAt) { setItems((cur) => cur.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))); setUnread((u) => Math.max(0, u - 1)); request(`/notifications/${n.id}/read`, { method: 'POST', body: {} }).catch(() => {}); }
    if (n.data?.roundId) router.navigate('/(tabs)/play');
  }
  return (
    <FlatList
      style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 10 }} data={items} keyExtractor={(n) => n.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(1); setRefreshing(false); }} />}
      onEndReached={() => items.length < total && load(page + 1, false)}
      ListHeaderComponent={<View style={{ gap: 10 }}>{err ? <Banner text={err} tone="danger" /> : null}
        {unread > 0 && <Button title={`Mark all ${unread} as read`} kind="ghost" onPress={async () => { await request('/notifications/read-all', { method: 'POST', body: {} }); load(1); }} />}</View>}
      ListEmptyComponent={<Text style={{ color: colors.muted, textAlign: 'center', marginTop: 24 }}>Nothing yet. You will be told here when rounds open and results are published.</Text>}
      renderItem={({ item }) => (
        <Pressable onPress={() => open(item)} accessibilityRole="button"
          style={{ backgroundColor: item.readAt ? '#fff' : '#eef2ff', borderRadius: 14, borderWidth: 1, borderColor: item.readAt ? colors.border : '#a5b4fc', padding: 14, gap: 4 }}>
          <Text style={{ fontWeight: '700', color: colors.text }}>{item.title}</Text>
          <Text style={{ color: colors.text }}>{item.body}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(item.createdAt).toLocaleString()}</Text>
        </Pressable>)}
    />
  );
}
