import AsyncStorage from '@react-native-async-storage/async-storage';
import { initAdMob } from '@/services/adMob';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Splash screen'i tut — doğru sekme yüklenene kadar Ninniler flash'ını önler
SplashScreen.preventAutoHideAsync().catch(() => {});

const RC_API_KEY = 'test_NEQGTCZprAVYcQdZUYZcAHvMdEd';

export default function RootLayout() {
  useEffect(() => {
    // AdMob — IS_AVAILABLE false ise initAdMob hiçbir şey yapmaz (Expo Go güvenli)
    try { initAdMob().catch(() => {}); } catch (_) {}

    // RevenueCat — EAS Build only; native module absent in Expo Go → skip
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Purchases = require('react-native-purchases').default;
      if (Purchases?.configure) Purchases.configure({ apiKey: RC_API_KEY });
    } catch {
      // Native module not linked (Expo Go) — skip
    }

    AsyncStorage.getItem('lumibaby_onboarding_done').then(v => {
      if (!v) router.replace('/onboarding');
      else router.replace('/(tabs)/analiz');
      // Navigasyon kararı verildikten sonra splash screen'i kapat
      SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
      </Stack>
    </SafeAreaProvider>
  );
}
