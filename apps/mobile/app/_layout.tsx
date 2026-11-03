import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';

function Gate() {
  const { state } = useAuth();
  const segments = useSegments(); const router = useRouter();
  useEffect(() => {
    if (state === 'loading') return;
    const top = segments[0] as string | undefined;
    const publicScreen = top === 'login' || top === 'register' || top === 'locked';
    if (state === 'out' && !(top === 'login' || top === 'register')) router.replace('/login');
    else if (state === 'locked' && top !== 'locked') router.replace('/locked');
    else if (state === 'in' && (publicScreen || !top)) router.replace('/(tabs)');
  }, [state, segments, router]);

  if (state === 'loading') return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function Root() {
  return <SafeAreaProvider><AuthProvider><StatusBar style="auto" /><Gate /></AuthProvider></SafeAreaProvider>;
}
