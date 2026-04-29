import AsyncStorage from '@react-native-async-storage/async-storage';
import { initAdMob } from '@/services/adMob';
import { configureRevenueCat } from '@/services/revenuecat';
import { PremiumProvider } from '@/contexts/PremiumContext';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

SplashScreen.preventAutoHideAsync().catch(() => {});

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    const { error } = this.state;
    if (error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#07101e', justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: '#ff6b6b', fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>
            Uygulama Hatası
          </Text>
          <ScrollView>
            <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'monospace' }}>
              {String(error)}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try { initAdMob().catch(() => {}); } catch (_) {}
    try { configureRevenueCat(); } catch {}

    AsyncStorage.getItem('lumibaby_onboarding_done')
      .then(v => {
        if (!v) router.replace('/onboarding');
        else router.replace('/(tabs)/analiz');
      })
      .catch(() => {
        router.replace('/(tabs)/analiz');
      })
      .finally(() => {
        setReady(true);
        SplashScreen.hideAsync().catch(() => {});
      });
  }, []);

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

export default function RootLayoutWithBoundary() {
  return (
    <ErrorBoundary>
      <RootLayout />
    </ErrorBoundary>
  );
}
