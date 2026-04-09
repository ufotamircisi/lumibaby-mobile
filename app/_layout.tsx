import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import { useEffect } from 'react';
import Purchases from 'react-native-purchases';

const RC_API_KEY = 'test_NEQGTCZprAVYcQdZUYZcAHvMdEd';

export default function RootLayout() {
  useEffect(() => {
    // Initialize RevenueCat
    Purchases.configure({ apiKey: RC_API_KEY });

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
