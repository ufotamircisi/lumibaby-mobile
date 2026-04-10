import AsyncStorage from '@react-native-async-storage/async-storage';
import { initAdMob } from '@/services/adMob';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';

const RC_API_KEY = 'test_NEQGTCZprAVYcQdZUYZcAHvMdEd';

export default function RootLayout() {
  useEffect(() => {
    // Initialize AdMob (native, EAS Build only — no-op in Expo Go)
    initAdMob().catch(() => {});

    // Initialize RevenueCat — only available in EAS Build (native module), not Expo Go
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Purchases = require('react-native-purchases').default;
      Purchases.configure({ apiKey: RC_API_KEY });
    } catch {
      // Native module not linked (Expo Go) — skip
    }

    AsyncStorage.getItem('lumibaby_onboarding_done').then(v => {
      if (!v) router.replace('/onboarding');
    });
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}
