import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

export const colors = { bg: '#f8fafc', card: '#fff', border: '#e2e8f0', text: '#0f172a', muted: '#64748b', primary: '#4f46e5', danger: '#dc2626', warn: '#d97706' };

export function Button({ title, onPress, busy, kind = 'primary' }: { title: string; onPress: () => void; busy?: boolean; kind?: 'primary' | 'ghost' | 'danger' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={busy}
      style={({ pressed }) => [s.btn, kind === 'primary' && { backgroundColor: colors.primary }, kind === 'danger' && { backgroundColor: colors.danger },
        kind === 'ghost' && { borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff' }, (pressed || busy) && { opacity: 0.6 }]}>
      {busy ? <ActivityIndicator color={kind === 'ghost' ? colors.text : '#fff'} /> : <Text style={[s.btnText, kind === 'ghost' && { color: colors.text }]}>{title}</Text>}
    </Pressable>
  );
}
export function Field(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} {...props} style={[s.input, props.style]} />;
}
export function Card({ children }: { children: React.ReactNode }) { return <View style={s.card}>{children}</View>; }
export function Row({ k, v }: { k: string; v: string }) {
  return <View style={s.row}><Text style={{ color: colors.muted }}>{k}</Text><Text style={{ color: colors.text, flexShrink: 1, textAlign: 'right' }}>{v}</Text></View>;
}
export function Banner({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'danger' }) {
  return <View style={[s.banner, { backgroundColor: tone === 'warn' ? '#fffbeb' : '#fef2f2', borderColor: tone === 'warn' ? '#fcd34d' : '#fca5a5' }]}><Text style={{ color: tone === 'warn' ? '#92400e' : '#991b1b' }}>{text}</Text></View>;
}
const s = StyleSheet.create({
  btn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  input: { borderWidth: 1, borderColor: colors.border, backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  banner: { borderWidth: 1, borderRadius: 10, padding: 12 },
});
