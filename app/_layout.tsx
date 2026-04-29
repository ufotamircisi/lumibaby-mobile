import AsyncStorage from '@react-native-async-storage/async-storage';
import { initAdMob } from '@/services/adMob';
import { configureRevenueCat } from '@/services/revenuecat';
import { PremiumProvider } from '@/contexts/PremiumContext';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { initAdMob().catch(() => {}); } catch (_) {}
    try { configureRevenueCat(); } catch {}

    AsyncStorage.getItem('lumibaby_onboarding_done').then(v => {
      if (!v) router.replace('/onboarding');
      else router.replace('/(tabs)/analiz');
      setReady(true);
      SplashScreen.hideAsync().catch(() => {});
    });
  }, []);

  // Stack'i sadece doğru route belirlendikten sonra render et.
  // Böylece (tabs)/index hiç görünmez — splash arkasında kalır.
  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PremiumProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        </Stack>
      </PremiumProvider>
    </SafeAreaProvider>
  );
}
