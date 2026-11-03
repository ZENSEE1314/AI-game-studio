import { Tabs } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/components/ui';

export default function TabsLayout() {
  const { profile } = useAuth();
  const manager = !!profile && profile.role !== 'USER';
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const tick = () => request<{ unread: number }>('/notifications/unread-count').then((r) => setUnread(r.unread)).catch(() => {});
    tick(); const t = setInterval(tick, 30000); return () => clearInterval(t);
  }, []);
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerTitleAlign: 'left' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="play" options={{ title: 'Play' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts', tabBarBadge: unread > 0 ? unread : undefined }} />
      <Tabs.Screen name="team" options={{ title: 'Team', href: manager ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
