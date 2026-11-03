import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { request } from '@/lib/api';
import { Banner, Button, Card, Field, colors } from '@/components/ui';

const NUMS = Array.from({ length: 27 }, (_, i) => i + 1);
type Wallet = { available: number; held: number; total: number };

export default function Play() {
  const [w, setW] = useState<Wallet | null>(null); const [rounds, setRounds] = useState<any[]>([]); const [rid, setRid] = useState('');
  const [round, setRound] = useState<any>(null); const [picks, setPicks] = useState<Record<number, string>>({});
  const [board, setBoard] = useState<any[]>([]);
  const [err, setErr] = useState(''); const [note, setNote] = useState(''); const [busy, setBusy] = useState(false); const [refreshing, setRefreshing] = useState(false);

  const loadRound = useCallback(async (id: string) => {
    const r = await request<any>(`/game/rounds/${id}`);
    setRound(r); setPicks(Object.fromEntries(r.mine.map((m: any) => [m.number, String(m.stake)])));
  }, []);
  const loadAll = useCallback(async (keep?: string) => {
    setErr('');
    try {
      const [wallet, rs, lb] = await Promise.all([request<Wallet>('/wallet/me'), request<any[]>('/game/rounds'), request<any[]>('/game/leaderboard?limit=5')]);
      setW(wallet); setRounds(rs); setBoard(lb);
      const pick = keep && rs.some((r) => r.id === keep) ? keep : rs.find((r) => r.status === 'OPEN')?.id ?? rs[0]?.id ?? '';
      setRid(pick); if (pick) await loadRound(pick); else setRound(null);
    } catch (e: any) { setErr(e.message); }
  }, [loadRound]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const open = round?.status === 'OPEN'; const min = Number(round?.minStake ?? 0);
  const entries = Object.entries(picks).map(([n, s]) => ({ number: Number(n), stake: Number(s) }));
  const total = entries.reduce((a, e) => a + (Number.isFinite(e.stake) ? e.stake : 0), 0);
  const heldNow = (round?.mine ?? []).reduce((a: number, m: any) => a + Number(m.stake), 0);
  const afford = !!w && total <= w.available + heldNow;
  const valid = entries.every((e) => Number.isInteger(e.stake) && e.stake >= min);
  const toggle = (n: number) => { if (!open) return; setNote(''); setPicks((p) => { const c = { ...p }; if (c[n] !== undefined) delete c[n]; else c[n] = String(min); return c; }); };

  async function save() {
    setBusy(true); setErr(''); setNote('');
    try { await request(`/game/rounds/${rid}/selections`, { method: 'POST', body: { picks: entries } }); setNote(entries.length ? 'Picks saved' : 'Picks cleared'); await loadAll(rid); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const win = round?.result?.number;
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadAll(rid); setRefreshing(false); }} />}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>In-game credits have no cash value and cannot be bought, sold, transferred or withdrawn. They are only held while a round is open and are always returned.</Text>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <View><Text style={{ color: colors.muted }}>Available</Text><Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{w ? w.available.toLocaleString() : '…'}</Text></View>
          <View><Text style={{ color: colors.muted }}>Held</Text><Text style={{ fontSize: 20, fontWeight: '700', color: colors.text }}>{w ? w.held.toLocaleString() : '…'}</Text></View>
        </View>
      </Card>
      {err ? <Banner text={err} tone="danger" /> : null}{note ? <Banner text={note} /> : null}
      {rounds.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {rounds.slice(0, 8).map((r) => (
            <Pressable key={r.id} onPress={() => { setRid(r.id); setNote(''); loadRound(r.id).catch((e) => setErr(e.message)); }}
              style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: r.id === rid ? colors.primary : colors.border, backgroundColor: r.id === rid ? '#eef2ff' : '#fff' }}>
              <Text style={{ color: colors.text }}>{r.name} · {r.status.toLowerCase()}</Text></Pressable>))}
        </ScrollView>)}
      {!round ? <Text style={{ color: colors.muted }}>No rounds yet.</Text> : (
        <Card>
          <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>{round.name}</Text>
          <Text style={{ color: colors.muted }}>{round.status.toLowerCase()} · minimum {min.toLocaleString()} per number</Text>
          {win ? <Banner text={`Winning number: ${win}. Winners: ${round.winners?.length ? round.winners.map((x: any) => x.fullName).join(', ') : 'nobody'}`} /> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {NUMS.map((n) => { const on = picks[n] !== undefined; return (
              <Pressable key={n} accessibilityRole="button" accessibilityState={{ selected: on, disabled: !open }} onPress={() => toggle(n)}
                style={{ width: 48, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: win === n ? 3 : 1,
                  borderColor: win === n ? colors.primary : on ? colors.primary : colors.border, backgroundColor: on ? colors.primary : '#fff', opacity: open ? 1 : 0.6 }}>
                <Text style={{ color: on ? '#fff' : colors.text, fontWeight: '600' }}>{n}</Text></Pressable>); })}
          </View>
          {entries.map((e) => (
            <View key={e.number} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ width: 80, color: colors.text }}>Number {e.number}</Text>
              <Field style={{ flex: 1 }} editable={open} keyboardType="number-pad" value={picks[e.number]} onChangeText={(v) => setPicks({ ...picks, [e.number]: v.replace(/\D/g, '') })} />
            </View>))}
          {open && <>
            {!afford && <Text style={{ color: colors.danger }}>Not enough credits</Text>}
            {!valid && <Text style={{ color: colors.danger }}>Each number needs at least {min.toLocaleString()}</Text>}
            <Button title={entries.length ? `Save picks (${total.toLocaleString()} held)` : 'Clear my picks'} onPress={save} busy={busy} />
            {(!valid || !afford) && <Text style={{ color: colors.muted, fontSize: 12 }}>Fix the amounts above to save.</Text>}
          </>}
          {!open && round.status !== 'COMPLETED' && <Text style={{ color: colors.muted }}>Picks are {round.status === 'CANCELLED' ? 'closed (round cancelled)' : 'locked'}.</Text>}
        </Card>)}
      <Card>
        <Text style={{ fontWeight: '700', color: colors.text }}>Leaderboard (rounds won)</Text>
        {board.length === 0 ? <Text style={{ color: colors.muted }}>No winners yet</Text> : board.map((b) => <Text key={b.userId} style={{ color: colors.text }}>#{b.rank} {b.fullName} — {b.wins} win(s)</Text>)}
      </Card>
    </ScrollView>
  );
}
