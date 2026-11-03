import { Tabs } from 'expo-router';
import React from 'react';
import { useAuth } from '@/lib/auth';
import { colors } from '@/components/ui';

export default function TabsLayout() {
  const { profile } = useAuth();
  const manager = !!profile && profile.role !== 'USER';
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: colors.primary, headerTitleAlign: 'left' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="team" options={{ title: 'Team', href: manager ? undefined : null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
